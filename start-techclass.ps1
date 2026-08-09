$ErrorActionPreference = "Stop"

$project = "/mnt/c/techclass.cevdetabbas.com"
wsl.exe -e bash -lc "cd '$project' && chmod +x ./start-techclass-wsl.sh && ./start-techclass-wsl.sh"
