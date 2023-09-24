# YT Video,Stream Crawler, Discord Robot Push Broadcast (Auto/Manual)

## How to install

1. install node_modules
```Powershell
npm i
```

2. create config.json and channels.json, please refer to config-example.json and channels-example.json

3. run node
```Powershell
node app.js
```

## Description

After running app.js, it will automatically grab the "current day" video of the channels in channels.json at the whole time and half time, and send it to the specified channel (the sent video will not be sent again).

## Discord Channel Commands

### Video commands
- `!vd ls`: get channel list
- `!vd add @[channel name]`: add channel list
- `!vd del @[channel name]`: delete channel list
- `!clr`: crawler and save videos
- `!vd`: get videos

### Strem commands
- `!st ls`: get channel list
- `!st add @[channel name]`: add channel list
- `!st del @[channel name]`: delete channel list
- `!clr`: crawler and save videos
- `!st`: get streams