# Project: zaru-smeta (desktop)

## Local LLM (Ollama)
This project is set up to run Claude Code via Ollama's OpenAI-compatible endpoint.

PowerShell (current session):
```
$env:ANTHROPIC_BASE_URL = "http://localhost:11434/v1"
$env:ANTHROPIC_MODEL = "qwen2.5:7b"
# Optional if a key is required by a tool wrapper:
# $env:ANTHROPIC_API_KEY = "ollama"
```

Common models already available:
- qwen2.5:7b (default)
- glm-5:cloud
- kimi-k2.5:cloud

## Project commands
From C:\Projects\SmetaAI\desktop:
```
# lint (auto-fix)
npm run lint

# start app
npm run start

# build
npm run build:win
```

## Notes
- Local project dependencies (node_modules) live next to the project folder.
- Global tools and models are on E:\ via NPM_CONFIG_PREFIX and OLLAMA_MODELS.
