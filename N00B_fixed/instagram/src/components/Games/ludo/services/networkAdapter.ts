import { EmoteMessage, GameMode, LudoGameState, Player, PlayerColor } from '../types';
import { chooseBotMove } from '../engine/aiBot';
import {
  advanceTurn,
  ALL_4P_COLORS,
  createInitialGameState,
  executeMove,
  handleDiceRoll,
} from '../engine/ludoRules';

export type NetworkEventType =
  | 'state_updated'
  | 'dice_rolled'
  | 'token_moved'
  | 'turn_changed'
  | 'emote_received'
  | 'game_finished';

export type NetworkEventListener = (data: unknown) => void;

class LudoNetworkAdapter {
  private currentGameState: LudoGameState | null = null;
  private listeners: Map<NetworkEventType, Set<NetworkEventListener>> = new Map();
  private localPlayerId: string = '';
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  // Bumped whenever the computer's plan changes, so a timer that was already on its way can never act on an outdated plan.
  private botPlan = 0;
  private turnCountdownTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startTurnCountdownLoop();
  }

  public subscribe(event: NetworkEventType, listener: NetworkEventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  private emit(event: NetworkEventType, data: unknown) {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(data);
      } catch (err) {
        console.error(`Error in network listener for ${event}:`, err);
      }
    });
  }

  public getGameState(): LudoGameState | null {
    return this.currentGameState;
  }

  public getLocalPlayerId(): string {
    return this.localPlayerId;
  }

  public setLocalPlayerId(id: string) {
    this.localPlayerId = id;
  }

  /**
   * Start a new match on this device (vs computer or pass and play)
   */
  public startLocalGame(config: {
    mode: GameMode;
    players: Omit<Player, 'tokens' | 'hasFinished' | 'tokensHome' | 'capturedCount' | 'consecutiveSixes'>[];
  }): LudoGameState {
    this.clearTimers();
    const gameId = 'game_' + Math.random().toString(36).substring(2, 9);
    const roomId = 'room_' + Math.random().toString(36).substring(2, 9);
    
    const initialState = createInitialGameState({
      gameId,
      roomId,
      mode: config.mode,
      players: config.players,
    });

    this.currentGameState = initialState;
    this.emit('state_updated', this.currentGameState);

    // If first player is a bot, schedule bot turn
    this.checkAndTriggerBotTurn();
    return initialState;
  }

  /**
   * Pick a saved match back up (the app was closed or refreshed in the middle of it). The turn clock starts over, and a computer
   * player that was half-way through its turn simply rolls again.
   */
  public restoreLocalGame(saved: LudoGameState): LudoGameState {
    this.clearTimers();
    const state: LudoGameState = JSON.parse(JSON.stringify(saved));
    state.turnTimeRemaining = state.turnTimeout;
    const current = state.players.find((p) => p.color === state.currentTurnColor);
    if (current?.isBot && state.diceRollStatus === 'waiting_move') {
      state.diceRollStatus = 'waiting_roll';
      state.diceValue = null;
      state.legalTokenIds = [];
    }
    this.currentGameState = state;
    this.emit('state_updated', this.currentGameState);
    this.checkAndTriggerBotTurn();
    return state;
  }

  /**
   * Roll the dice (authoritative check)
   */
  public rollDice(): number {
    if (!this.currentGameState) return 1;

    // Local / offline authoritative engine
    const rolledVal = Math.floor(Math.random() * 6) + 1;
    const { nextState, hasLegalMoves } = handleDiceRoll(this.currentGameState, rolledVal);

    this.currentGameState = nextState;
    this.emit('dice_rolled', {
      diceValue: rolledVal,
      color: nextState.currentTurnColor,
      hasLegalMoves,
    });
    this.emit('state_updated', this.currentGameState);

    if (hasLegalMoves) {
      // If only 1 legal move, or if bot turn, handle accordingly
      const currentPlayer = this.currentGameState.players.find(
        (p) => p.color === this.currentGameState!.currentTurnColor
      );

      if (currentPlayer?.isBot) {
        this.checkAndTriggerBotTurn();
      } else if (nextState.legalTokenIds.length === 1) {
        // Auto-move single legal move option after short delay for snappy feel
        setTimeout(() => {
          if (this.currentGameState?.diceRollStatus === 'waiting_move' && this.currentGameState.legalTokenIds.length === 1) {
            this.moveToken(this.currentGameState.legalTokenIds[0]);
          }
        }, 350);
      }
    } else {
      // Turn automatically passed to next player
      this.checkAndTriggerBotTurn();
    }

    return rolledVal;
  }

  /**
   * Move a token (authoritative check)
   */
  public moveToken(tokenId: number): boolean {
    if (!this.currentGameState) return false;

    // Local / offline authoritative engine
    try {
      const result = executeMove(this.currentGameState, tokenId);
      this.currentGameState = result.nextState;

      this.emit('token_moved', {
        moveRecord: result.moveRecord,
        captured: result.captured,
        reachedHome: result.reachedHome,
        extraTurn: result.extraTurn,
      });
      this.emit('state_updated', this.currentGameState);

      if (this.currentGameState.status === 'completed') {
        this.emit('game_finished', {
          winner: this.currentGameState.winner,
          winningTeam: this.currentGameState.winningTeam,
          rankings: this.currentGameState.rankings,
        });
      } else {
        this.checkAndTriggerBotTurn();
      }

      return true;
    } catch (err) {
      console.error('Invalid move rejected:', err);
      return false;
    }
  }

  /**
   * Broadcast quick safe emote to all players
   */
  public sendEmote(senderName: string, textOrEmoji: string) {
    if (!this.currentGameState) return;

    const activePlayer = this.currentGameState.players.find(
      (p) => p.id === this.localPlayerId || p.color === this.currentGameState!.currentTurnColor
    );
    const color = activePlayer?.color || 'red';

    const emote: EmoteMessage = {
      id: 'emote_' + Date.now(),
      playerId: this.localPlayerId,
      color,
      senderName,
      textOrEmoji,
      timestamp: Date.now(),
    };

    this.emit('emote_received', emote);
  }

  /**
   * Automatic countdown timer loop for player turns
   */
  private startTurnCountdownLoop() {
    if (this.turnCountdownTimer) clearInterval(this.turnCountdownTimer);

    this.turnCountdownTimer = setInterval(() => {
      if (
        this.currentGameState &&
        this.currentGameState.status === 'in_progress' &&
        this.currentGameState.winner === null
      ) {
        if (this.currentGameState.turnTimeRemaining > 0) {
          this.currentGameState.turnTimeRemaining -= 1;
        } else {
          // Turn timed out: auto-play or pass!
          this.handleTurnTimeout();
        }
      }
    }, 1000);
  }

  private handleTurnTimeout() {
    if (!this.currentGameState || this.currentGameState.status !== 'in_progress') return;

    if (this.currentGameState.diceRollStatus === 'waiting_roll') {
      // Auto roll dice on timeout
      this.rollDice();
    } else if (this.currentGameState.diceRollStatus === 'waiting_move') {
      // Auto pick first legal move
      if (this.currentGameState.legalTokenIds.length > 0) {
        this.moveToken(this.currentGameState.legalTokenIds[0]);
      } else {
        advanceTurn(this.currentGameState);
        this.emit('state_updated', this.currentGameState);
        this.checkAndTriggerBotTurn();
      }
    }
  }

  /**
   * Computer players: whenever it is a computer player's turn, ONE timer is set for its next step (roll the dice, or move a token after
   * a rolled dice). Every roll / move / turn change comes back through here, so there is only ever one timer, and it always looks at the
   * live game when it fires. (An earlier version let a roll leave a second, forgotten timer behind; that one later made the computer
   * act on a stale picture of its own tokens, found no move, and the match sat still until the turn clock ran out.)
   */
  private checkAndTriggerBotTurn() {
    this.clearTimers();
    const state = this.currentGameState;
    if (!state || state.status !== 'in_progress') return;

    const currentPlayer = state.players.find((p) => p.color === state.currentTurnColor);
    if (!currentPlayer || !currentPlayer.isBot || currentPlayer.hasFinished) return;
    if (state.diceRollStatus !== 'waiting_roll' && state.diceRollStatus !== 'waiting_move') return;

    // thinking delay: a little longer before rolling than before moving
    const delay = state.diceRollStatus === 'waiting_roll' ? 650 + Math.random() * 450 : 550 + Math.random() * 400;
    const plan = ++this.botPlan;
    this.botTimer = setTimeout(() => this.runBotStep(plan), delay);
  }

  private runBotStep(plan: number) {
    if (plan !== this.botPlan) return;
    this.botTimer = null;
    const state = this.currentGameState;
    if (!state || state.status !== 'in_progress') return;
    const player = state.players.find((p) => p.color === state.currentTurnColor);
    if (!player || !player.isBot) return;

    if (state.diceRollStatus === 'waiting_roll') {
      this.rollDice();                       // schedules the move (or the next player's turn) itself
      return;
    }
    if (state.diceRollStatus === 'waiting_move') {
      let tokenId = chooseBotMove(player, state.diceValue ?? 0, state.players, state.mode, player.botDifficulty || 'medium');
      if (tokenId === null) tokenId = state.legalTokenIds[0] ?? null;   // never leave a legal move unplayed
      if (tokenId !== null) this.moveToken(tokenId);
    }
  }

  public forfeitGame(playerId: string) {
    if (!this.currentGameState) return;

    const player = this.currentGameState.players.find((p) => p.id === playerId);
    if (player) {
      player.hasFinished = true;
      player.finishRank = this.currentGameState.players.length;
    }

    advanceTurn(this.currentGameState);
    this.emit('state_updated', this.currentGameState);
  }

  public clearTimers() {
    this.botPlan++;                          // anything already on its way is now outdated
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
  }

  public leaveRoom() {
    this.clearTimers();
    this.currentGameState = null;
  }
}

export const networkAdapter = new LudoNetworkAdapter();
