import { BotDifficulty, GameMode, Player, PlayerColor, TokenState } from '../types';
import { SAFE_TRACK_INDEXES_4P, TRACK_COORDINATES_4P } from './boardCoordinates';
import { calculateLegalMoves, MoveCalculation } from './ludoRules';

/**
 * Select best token to move for an AI bot based on its difficulty
 */
export function chooseBotMove(
  botPlayer: Player,
  diceValue: number,
  allPlayers: Player[],
  mode: GameMode,
  difficulty: BotDifficulty = 'medium'
): number | null {
  const legalMoves = calculateLegalMoves(botPlayer, diceValue, allPlayers, mode);

  if (legalMoves.length === 0) return null;
  if (legalMoves.length === 1) return legalMoves[0].tokenId;

  // Easy bot: picks randomly
  if (difficulty === 'easy') {
    const randomIndex = Math.floor(Math.random() * legalMoves.length);
    return legalMoves[randomIndex].tokenId;
  }

  // Medium and Hard bots: score candidate moves
  const scoredMoves = legalMoves.map((move) => {
    let score = scoreCandidateMove(move, botPlayer, allPlayers, mode);

    // Medium bot has small noise factor
    if (difficulty === 'medium') {
      score += (Math.random() - 0.5) * 80;
    }

    return { tokenId: move.tokenId, score };
  });

  scoredMoves.sort((a, b) => b.score - a.score);
  return scoredMoves[0].tokenId;
}

function scoreCandidateMove(
  move: MoveCalculation,
  player: Player,
  allPlayers: Player[],
  mode: GameMode
): number {
  let score = 0;

  // 1. Finishing a token into home is top priority
  if (move.willReachHome) {
    score += 600;
  }

  // 2. Capturing an opponent token gives an extra turn and knocks them back
  if (move.willCaptureOpponent) {
    score += 450;
  }

  // 3. Exiting yard on a 6 activates another runner
  if (move.nextStatus === 'track' && move.nextStepCount === 1) {
    const tokensInYard = player.tokens.filter((t) => t.status === 'yard').length;
    // If we have many tokens in yard, exiting is very valuable
    score += 260 + tokensInYard * 30;
  }

  // 4. Entering home path (safe from any capture!)
  if (move.nextStatus === 'home_path') {
    score += 220;
  }

  // 5. Landing on a safe square
  if (move.nextStatus === 'track' && SAFE_TRACK_INDEXES_4P.has(move.nextPosition)) {
    score += 150;
  }

  // 6. Check if current token was under threat from an opponent behind it
  const currentToken = player.tokens.find((t) => t.id === move.tokenId);
  if (currentToken && currentToken.status === 'track' && !SAFE_TRACK_INDEXES_4P.has(currentToken.position)) {
    const isUnderThreat = checkIsUnderThreat(currentToken.position, player.color, allPlayers, mode);
    if (isUnderThreat) {
      score += 180; // Escape threat!
    }
  }

  // 7. Check if landing square would be under threat from an opponent
  if (move.nextStatus === 'track' && !SAFE_TRACK_INDEXES_4P.has(move.nextPosition)) {
    const willBeUnderThreat = checkIsUnderThreat(move.nextPosition, player.color, allPlayers, mode);
    if (willBeUnderThreat) {
      score -= 120; // Risky move
    }
  }

  // 8. Progress bonus: prefer moving tokens closer to home
  score += move.nextStepCount * 2;

  return score;
}

function checkIsUnderThreat(
  trackPos: number,
  botColor: PlayerColor,
  allPlayers: Player[],
  mode: GameMode
): boolean {
  for (const otherPlayer of allPlayers) {
    if (otherPlayer.color === botColor) continue;
    if (mode === 'team_2v2' && otherPlayer.team && otherPlayer.team === otherPlayer.team) {
      // In team mode, teammate is not a threat
      continue;
    }

    for (const oppToken of otherPlayer.tokens) {
      if (oppToken.status === 'track') {
        // Opponent can reach in 1 to 6 steps
        const distance = (trackPos - oppToken.position + TRACK_COORDINATES_4P.length) % TRACK_COORDINATES_4P.length;
        if (distance >= 1 && distance <= 6) {
          return true;
        }
      }
    }
  }
  return false;
}
