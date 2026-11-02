# Beat This Moment: final demo script

Target length: about 2:10. Hard limit: under 3:00. Submission closes November 2, 2026 at 2:00 pm Pacific.

The rules need three things on screen: the project working on Twitch, how it was built with Codex, and no third-party music or material without permission. The Twitch and Codex shots below cover the first two. Use no music.

## Test before filming

The publish post and the lead post both worked in real Twitch chat on November 2. Lead posts are at least 30 seconds apart, so leave a gap between finishes. Keep the **[if seen]** lines only if the post is on screen in your footage.

`!join` from a second Twitch account was not tested, so film it from the broadcaster account and say so. Wait more than 10 seconds between `!challenge` and `!join`, because the bot ignores a second command from the same person inside that window. Say only what the footage shows.

## Script

One question runs through the whole video: could chat have done better? It is asked at the start and answered at the end. The narration talks to "you", the streamer.

### The question

**Show:** the channel page on twitch.tv, live. The run ends in a crash. Card with what chat says, then card with the question.

> You're live on Twitch. You crash, and chat says what it always says. Easy. I'd have made that. So, could they?

### The answer starts here

**Show:** title card, then a statement card.

> This is Beat This Moment. I'm Swayam. Chat can talk, but it can't play your run. Now it can.

### Your crash

**Show:** Sign in with Twitch, the consent screen, connected status. Run, crash, Challenge chat. Cut to the post in Twitch chat.

> You sign in through Twitch, and your channel is connected. You play Neon Freight, a small jump and dash game we built for this. You crash. One click on Challenge chat saves the moment just before it. And it lands in chat right away.

### Chat's turn

**Show:** Twitch chat. `!challenge`, and the link comes back. Wait more than 10 seconds, then `!join` from the same account, and the personal link comes back.

> Now it's chat's turn. There's nothing to install. The challenge command gives anyone the link. The join command gives you your own link, so your run carries your Twitch name. I'm using my own account here.

### Same moment

**Show:** the viewer's browser, then a card, then the run on the board. A new run arrives with no reload: first on the host's page, then on the live stream beside chat.

> Here's a viewer's run. Same position. Same speed. Same energy. Same course. Same moment. Different player. The board updates live, on the page and on stream. Finishes rank above crashes, and the fastest finish leads.

### The rematch

**Show:** a run racing the ghost, a replay from the board, the host's remove button, the lead post in chat.

> Now there's something to chase. The best finish becomes a ghost, and everyone races against it. Any run can be replayed. You can remove anyone from the board. And when someone takes the lead, chat hears about it. So the next rematch begins.

### So let's push

**Show:** the real replies from the hosted game to two fake runs (`demo/footage/refused.json`), each stamped Refused.

> So let's push. Send the server a made-up run. Refused. Send a finished run, faster than anyone could play it. Refused. The server replays every input and works out the score itself. Bots can still play. But a made-up time won't count.

### Built with Codex

**Show:** source in `public/engine.js`, then `npm test` passing all 59 tests. The Codex thread goes in through the session ID on the submission form, not on screen.

> We built this with Codex. Codex helped us write one game engine that runs in both the browser and the server. That's why a replay comes out exactly the same. It also helped build the Twitch connection: sign-in, live chat events, and chat posts. And 59 automated tests check it on every push.

### The answer

**Show:** a card on small games, the board, then the closing card. Its last line appears phrase by phrase.

> AI is making small games far easier to build. They open from a link, and you learn them in seconds. Twitch doesn't have to be only big titles. So, could chat have done better? Don't argue. Check the board. This is Beat This Moment. You crash. Chat plays. The board decides.

## Stay accurate

- Don't say Codex wrote everything. Say "built with Codex" or "helped".
- Don't say this works with any game, or with Twitch video. It supports one game we built.
- Don't say cheating is impossible. Replay stops made-up scores, but not bots or tool-assisted inputs.
- Don't call a run verified Twitch identity. `!join` links are visible in chat and are not a viewer login.
- Chat posts come from the broadcaster's own account, so don't call it a separate bot account on screen.

## Keep off screen

`.env`, OAuth tokens, host keys, stream keys, private tabs, account settings, and browser profile details.

## Recording setup

- OBS profile and scene collection: `Beat This Moment`.
- Capture: dedicated Chrome game window, not the full display.
- Game address: https://beat-the-moment-35-211-225-40.sslip.io/?broadcast=1
- Viewer: use a separate browser or private window, not the OBS capture of the host.
- Output: Hybrid MP4, 1280×720 at 30 FPS, in this directory.
- Audio capture is muted. Add narration in an editor, or set up a microphone before recording.
- Streaming credentials are configured separately. This document contains no credentials.

## Publish

Upload to YouTube as public. Open the link while signed out to check it plays, then add it to the Devpost form.

This is the script, not evidence of a finished or uploaded video.
