# NOOB AI — the voice assistant (copy inside the NOOB repository)

This folder is the complete code of **NOOB AI**, the multilingual voice assistant that opens from the NOOB app
(**Profile → ⋮ → NOOB AI**) and runs at https://ai.nooob.xyz.

- Main repository (where it is developed): https://github.com/padmanabhsingh11107035-cyber/noobai
- This copy matches commit `3cecd13` of that repository.
- It does **not** run on Cloudflare with the NOOB website: the server (`server/`, Python) runs on the owner's PC
  and is reached through a Cloudflare Tunnel. The robot's code is `noob_esp32/noob_esp32.ino` (ESP32-S3).
- The NOOB app side (on the live branch `supabase-migration`) lives in `../instagram/src/components/Profile/NoobAiPage.tsx`, `NoobAiLogo.tsx`,
  `NoobAiCore3D.tsx` and `../instagram/src/utils/noobAi.ts`.

Start with [README.md](README.md) for what it does, the parts list, the wiring and the setup.
Private data (the memory database, settings with the Gemini key, logs) is never part of this code (see `.gitignore`).
