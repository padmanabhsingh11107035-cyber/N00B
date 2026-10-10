import {
  GameMode,
  LudoGameState,
  MoveRecord,
  Player,
  PlayerColor,
  TokenState,
  TokenStatus,
} from '../types';
import {
  COLOR_START_INDEX_4P,
  SAFE_TRACK_INDEXES_4P,
  TRACK_COORDINATES_4P,
} from './boardCoordinates';

// Total track steps before entering home path
export const TRACK_STEPS_TO_HOME_ENTRANCE = 51; // Steps 1 to 50 are on track; step 51 enters home column
export const TOTAL_STEPS_TO_FINISH = 56; // Step 56 lands directly in center home!

export const ALL_4P_COLORS: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];
export const ALL_6P_COLORS: PlayerColor[] = ['red', 'green', 'yellow', 'blue', 'purple', 'orange'];

export interface MoveCalculation {
  tokenId: number;
  canMove: boolean;
  nextStatus: TokenStatus;
  nextPosition: number;
  nextStepCount: number;
  willCaptureOpponent: boolean;
  capturedToken?: {
    playerIndex: number;
    tokenId: number;
    color: PlayerColor;
  };
  willReachHome: boolean;
}

/**
 * Calculate legal moves for a given player and dice value
 */
export function calculateLegalMoves(
  player: Player,
  diceValue: number,
  allPlayers: Player[],
  mode: GameMode
): MoveCalculation[] {
  if (player.hasFinished) return [];

  const results: MoveCalculation[] = [];

  for (const token of player.tokens) {
    if (token.status === 'home') {
      continue;
    }

    if (token.status === 'yard') {
      // Tokens in yard only exit on a 6
      if (diceValue === 6) {
        const startPos = COLOR_START_INDEX_4P[token.color] ?? 0;

        // Check if start position has an opponent token (even though start is safe from capture)
        // Note: Starting square is safe, so exiting does not capture on safe square
        results.push({
          tokenId: token.id,
          canMove: true,
          nextStatus: 'track',
          nextPosition: startPos,
          nextStepCount: 1,
          willCaptureOpponent: false,
          willReachHome: false,
        });
      }
      continue;
    }

    // Token is on track or in home path
    const projectedStep = token.stepCount + diceValue;

    if (projectedStep > TOTAL_STEPS_TO_FINISH) {
      // Cannot overshoot home! Must land with exact roll
      continue;
    }

    if (projectedStep === TOTAL_STEPS_TO_FINISH) {
      // Token reaches center home!
      results.push({
        tokenId: token.id,
        canMove: true,
        nextStatus: 'home',
        nextPosition: 6,
        nextStepCount: TOTAL_STEPS_TO_FINISH,
        willCaptureOpponent: false,
        willReachHome: true,
      });
      continue;
    }

    if (projectedStep > TRACK_STEPS_TO_HOME_ENTRANCE) {
      // Token is in or enters home path (corridor indices 0 to 4)
      const homePathIndex = projectedStep - (TRACK_STEPS_TO_HOME_ENTRANCE + 1);
      results.push({
        tokenId: token.id,
        canMove: true,
        nextStatus: 'home_path',
        nextPosition: homePathIndex,
        nextStepCount: projectedStep,
        willCaptureOpponent: false,
        willReachHome: false,
      });
      continue;
    }

    // Token stays on track
    const startIdx = COLOR_START_INDEX_4P[token.color] ?? 0;
    const nextTrackPos = (startIdx + (projectedStep - 1)) % TRACK_COORDINATES_4P.length;
    const isSafeSquare = SAFE_TRACK_INDEXES_4P.has(nextTrackPos);

    let willCapture = false;
    let capturedTarget: MoveCalculation['capturedToken'] = undefined;

    if (!isSafeSquare) {
      // Check if any opponent token is on this position
      for (let pIdx = 0; pIdx < allPlayers.length; pIdx++) {
        const otherP = allPlayers[pIdx];
        if (otherP.color === player.color) continue;

        // In 2v2 Team mode, teammates cannot capture each other
        if (mode === 'team_2v2' && otherP.team && player.team && otherP.team === player.team) {
          continue;
        }

        for (const oppToken of otherP.tokens) {
          if (oppToken.status === 'track' && oppToken.position === nextTrackPos) {
            willCapture = true;
            capturedTarget = {
              playerIndex: pIdx,
              tokenId: oppToken.id,
              color: otherP.color,
            };
            break;
          }
        }
        if (willCapture) break;
      }
    }

    results.push({
      tokenId: token.id,
      canMove: true,
      nextStatus: 'track',
      nextPosition: nextTrackPos,
      nextStepCount: projectedStep,
      willCaptureOpponent: willCapture,
      capturedToken: capturedTarget,
      willReachHome: false,
    });
  }

  return results;
}

/**
 * Execute a move deterministically on state
 */
export function executeMove(
  state: LudoGameState,
  tokenId: number
): {
  nextState: LudoGameState;
  moveRecord: MoveRecord;
  captured: boolean;
  reachedHome: boolean;
  extraTurn: boolean;
} {
  const nextState: LudoGameState = JSON.parse(JSON.stringify(state));
  const playerIndex = nextState.players.findIndex((p) => p.color === nextState.currentTurnColor);
  const player = nextState.players[playerIndex];

  if (!player || nextState.diceValue === null) {
    throw new Error('Invalid player or dice value');
  }

  const legalMoves = calculateLegalMoves(player, nextState.diceValue, nextState.players, nextState.mode);
  const moveCalc = legalMoves.find((m) => m.tokenId === tokenId);

  if (!moveCalc) {
    throw new Error(`Token ${tokenId} cannot move with dice value ${nextState.diceValue}`);
  }

  const token = player.tokens.find((t) => t.id === tokenId)!;
  const fromStatus = token.status;
  const fromPos = token.position;

  // Update token
  token.status = moveCalc.nextStatus;
  token.position = moveCalc.nextPosition;
  token.stepCount = moveCalc.nextStepCount;
  token.isSafe =
    token.status === 'yard' ||
    token.status === 'home' ||
    token.status === 'home_path' ||
    SAFE_TRACK_INDEXES_4P.has(token.position);

  let captured = false;
  let capturedColor: PlayerColor | undefined;
  let capturedTokenId: number | undefined;

  // Handle capture
  if (moveCalc.willCaptureOpponent && moveCalc.capturedToken) {
    captured = true;
    capturedColor = moveCalc.capturedToken.color;
    capturedTokenId = moveCalc.capturedToken.tokenId;

    const oppPlayer = nextState.players[moveCalc.capturedToken.playerIndex];
    const oppToken = oppPlayer.tokens.find((t) => t.id === moveCalc.capturedToken!.tokenId)!;

    oppToken.status = 'yard';
    oppToken.position = -1;
    oppToken.stepCount = 0;
    oppToken.isSafe = true;

    player.capturedCount = (player.capturedCount || 0) + 1;
    nextState.scores[player.color] = (nextState.scores[player.color] || 0) + 100;
  }

  let reachedHome = false;
  if (moveCalc.willReachHome) {
    reachedHome = true;
    player.tokensHome += 1;
    nextState.scores[player.color] = (nextState.scores[player.color] || 0) + 250;

    // Check if player has finished target tokens
    if (player.tokensHome >= nextState.targetTokensHome) {
      player.hasFinished = true;
      if (!nextState.rankings.includes(player.color)) {
        player.finishRank = nextState.rankings.length + 1;
        nextState.rankings.push(player.color);
      }
    }
  }

  // Check game completion
  checkGameCompletion(nextState);

  // Extra turn logic:
  // Rolling a 6 grants an extra turn (if consecutive 6s < 3)
  // Capturing an opponent grants an extra turn
  // Getting a token home grants an extra turn
  const rolledSix = nextState.diceValue === 6 && player.consecutiveSixes < 3;
  const extraTurn = !nextState.winner && (rolledSix || captured || reachedHome);

  const moveRecord: MoveRecord = {
    playerId: player.id,
    color: player.color,
    diceValue: nextState.diceValue,
    tokenId,
    fromStatus,
    fromPos,
    toStatus: token.status,
    toPos: token.position,
    capturedColor,
    capturedTokenId,
    timestamp: Date.now(),
  };

  nextState.moveHistory.push(moveRecord);
  nextState.updatedAt = Date.now();

  if (nextState.winner) {
    nextState.status = 'completed';
    nextState.diceRollStatus = 'waiting_roll';
  } else if (extraTurn) {
    // Player rolls again!
    nextState.diceValue = null;
    nextState.diceRollStatus = 'waiting_roll';
    nextState.legalTokenIds = [];
    nextState.turnTimeRemaining = nextState.turnTimeout;
  } else {
    // Advance to next active player
    player.consecutiveSixes = 0;
    advanceTurn(nextState);
  }

  return {
    nextState,
    moveRecord,
    captured,
    reachedHome,
    extraTurn,
  };
}

/**
 * Handle dice roll event and determine legal actions
 */
export function handleDiceRoll(
  state: LudoGameState,
  rolledValue: number
): {
  nextState: LudoGameState;
  hasLegalMoves: boolean;
  passedDueToThreeSixes: boolean;
} {
  const nextState: LudoGameState = JSON.parse(JSON.stringify(state));
  const player = nextState.players.find((p) => p.color === nextState.currentTurnColor);

  if (!player) {
    throw new Error('Current player not found');
  }

  nextState.diceValue = rolledValue;

  if (rolledValue === 6) {
    player.consecutiveSixes += 1;
  } else {
    player.consecutiveSixes = 0;
  }

  // 3 consecutive sixes rule: Penalty! Cancel turn and pass to next player
  if (player.consecutiveSixes >= 3) {
    player.consecutiveSixes = 0;
    nextState.diceRollStatus = 'waiting_roll';
    advanceTurn(nextState);
    return {
      nextState,
      hasLegalMoves: false,
      passedDueToThreeSixes: true,
    };
  }

  const legalMoves = calculateLegalMoves(player, rolledValue, nextState.players, nextState.mode);
  const legalTokenIds = legalMoves.map((m) => m.tokenId);

  nextState.legalTokenIds = legalTokenIds;

  if (legalTokenIds.length === 0) {
    // No legal moves: pass turn to next player
    nextState.diceRollStatus = 'waiting_roll';
    advanceTurn(nextState);
    return {
      nextState,
      hasLegalMoves: false,
      passedDueToThreeSixes: false,
    };
  }

  nextState.diceRollStatus = 'waiting_move';
  return {
    nextState,
    hasLegalMoves: true,
    passedDueToThreeSixes: false,
  };
}

/**
 * Pass turn to next active player in clockwise order
 */
export function advanceTurn(state: LudoGameState): void {
  const activePlayers = state.players.filter((p) => !p.hasFinished);
  if (activePlayers.length <= 1) {
    checkGameCompletion(state);
    return;
  }

  const currentIndex = state.players.findIndex((p) => p.color === state.currentTurnColor);
  let nextIndex = (currentIndex + 1) % state.players.length;

  while (state.players[nextIndex].hasFinished) {
    nextIndex = (nextIndex + 1) % state.players.length;
  }

  state.currentTurnColor = state.players[nextIndex].color;
  state.diceValue = null;
  state.diceRollStatus = 'waiting_roll';
  state.legalTokenIds = [];
  state.turnTimeRemaining = state.turnTimeout;
  state.turnCount += 1;
  state.lastActiveTimestamp = Date.now();
}

/**
 * Evaluate victory conditions
 */
export function checkGameCompletion(state: LudoGameState): void {
  if (state.mode === 'team_2v2') {
    const team1Players = state.players.filter((p) => p.team === 1);
    const team2Players = state.players.filter((p) => p.team === 2);

    const team1TotalHome = team1Players.reduce((sum, p) => sum + p.tokensHome, 0);
    const team2TotalHome = team2Players.reduce((sum, p) => sum + p.tokensHome, 0);

    const targetTeamTokens = state.targetTokensHome * 2;

    if (team1TotalHome >= targetTeamTokens) {
      state.winner = team1Players[0].color;
      state.winningTeam = 1;
      state.status = 'completed';
    } else if (team2TotalHome >= targetTeamTokens) {
      state.winner = team2Players[0].color;
      state.winningTeam = 2;
      state.status = 'completed';
    }
    return;
  }

  const finishedPlayers = state.players.filter((p) => p.hasFinished);
  if (finishedPlayers.length > 0 && !state.winner) {
    state.winner = finishedPlayers[0].color;
  }

  // If all but 1 player finished, the game is officially complete
  const unfinishedPlayers = state.players.filter((p) => !p.hasFinished);
  if (unfinishedPlayers.length <= 1) {
    state.status = 'completed';
    if (unfinishedPlayers.length === 1 && !state.rankings.includes(unfinishedPlayers[0].color)) {
      state.rankings.push(unfinishedPlayers[0].color);
      unfinishedPlayers[0].finishRank = state.players.length;
    }
  }
}

/**
 * Initialize a fresh game state
 */
export function createInitialGameState(config: {
  gameId: string;
  roomId: string;
  mode: GameMode;
  players: Omit<Player, 'tokens' | 'hasFinished' | 'tokensHome' | 'capturedCount' | 'consecutiveSixes'>[];
}): LudoGameState {
  const targetTokensHome = config.mode === 'quick' ? 2 : 4;

  const initializedPlayers: Player[] = config.players.map((p) => {
    const tokens: TokenState[] = [0, 1, 2, 3].map((id) => ({
      id,
      color: p.color,
      status: 'yard',
      position: -1,
      stepCount: 0,
      isSafe: true,
    }));

    return {
      ...p,
      tokens,
      hasFinished: false,
      tokensHome: 0,
      capturedCount: 0,
      consecutiveSixes: 0,
    };
  });

  return {
    gameId: config.gameId,
    roomId: config.roomId,
    mode: config.mode,
    targetTokensHome,
    playerCount: initializedPlayers.length,
    players: initializedPlayers,
    currentTurnColor: initializedPlayers[0].color,
    turnTimeout: config.mode === 'quick' ? 10 : 15,
    turnTimeRemaining: config.mode === 'quick' ? 10 : 15,
    diceValue: null,
    diceRollStatus: 'waiting_roll',
    legalTokenIds: [],
    status: 'in_progress',
    winner: null,
    rankings: [],
    scores: initializedPlayers.reduce(
      (acc, p) => ({ ...acc, [p.color]: 0 }),
      {} as Record<string, number>
    ),
    moveHistory: [],
    turnCount: 1,
    lastActiveTimestamp: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
