PERMISSION_DENIED: Permission denied

Call Stack 12

Hide 12 ignore-listed frame(s)

repoCallOnCompleteCallback/<

node_modules/@firebase/database/src/core/Repo.ts (909:23)

exceptionGuard

node_modules/@firebase/database/src/core/util/util.ts (540:5)

repoCallOnCompleteCallback

node_modules/@firebase/database/src/core/Repo.ts (899:19)

repoSetWithPriority/<

node_modules/@firebase/database/src/core/Repo.ts (587:33)

sendPut\_/<

node_modules/@firebase/database/src/core/PersistentConnection.ts (618:19)

onDataMessage\_

node_modules/@firebase/database/src/core/PersistentConnection.ts (650:19)

onDataMessage\_

node_modules/@firebase/database/src/realtime/Connection.ts (321:10)

onPrimaryMessageReceived\_

node_modules/@firebase/database/src/realtime/Connection.ts (313:12)

connReceiver\_/<

node_modules/@firebase/database/src/realtime/Connection.ts (210:16)

appendFrame\_

node_modules/@firebase/database/src/realtime/WebSocketConnection.ts (300:12)

handleIncomingFrame

node_modules/@firebase/database/src/realtime/WebSocketConnection.ts (352:14)

open/this.mySock.onmessage

node_modules/@firebase/database/src/realtime/WebSocketConnection.ts (222:12)
