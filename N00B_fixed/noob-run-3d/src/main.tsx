import '@fontsource-variable/outfit/index.css'
import '@fontsource/chakra-petch/latin-600.css'
import '@fontsource/chakra-petch/latin-700.css'
import '@fontsource/chakra-petch/latin-700-italic.css'
import { createRoot } from 'react-dom/client'
import { NoobRunGame } from './game'
import { LeaderboardService } from './game/services/LeaderboardService'
import './index.css'

// The game fills the frame NOOB shows it in. Its ranking is the shared NOOB score board (public/games/_shared/noob-score.js): every finished run sends its score.
createRoot(document.getElementById('root')!).render(
  <div className="fixed inset-0 bg-slate-950">
    <NoobRunGame
      user={{ userId: 'player', username: 'You', profilePicture: '🏃', level: 1, xp: 0, noobCoins: 0 }}
      className="w-full h-full"
      onGameOver={(result) => LeaderboardService.submit(result.score)}
    />
  </div>,
)
