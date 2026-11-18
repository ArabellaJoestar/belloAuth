wt -d "$PSScriptRoot" powershell -NoExit -Command "npm run start:dev" `; `
   split-pane -V -d "$PSScriptRoot\client-app" powershell -NoExit -Command "npm run start:dev" `; `
   split-pane -H -d "$PSScriptRoot\provider-app" powershell -NoExit -Command "npm run start:dev"