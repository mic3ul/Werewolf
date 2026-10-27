# WeirdWolf Web Edition

A phone-friendly, web-hosted edition of WeirdWolf for Telegram. It runs as a Cloudflare Worker and stores game state in Cloudflare D1, so it does not need a Windows server, SQL Server, a continuously running laptop, or a paid VPS.

This is a **new web edition alongside the original C#/.NET Framework project**, not a drop-in replacement or a complete port of every legacy feature. It currently implements a playable core game: room creation, joining, secret role cards, night actions, day voting, win checks, and persistent per-group state.

## Featured character: Qais, Keeper of Secrets

**Qais — عرّاف الأسرار** is a unique role created for this edition. Each night, Qais privately investigates one living player and receives their role. The result is sent only to Qais, never to the group.

## Requirements

- A Telegram bot created with [@BotFather](https://t.me/BotFather).
- A Cloudflare account using the Workers Free plan.
- A Cloudflare D1 database.
- The bot token and three configuration values stored as Cloudflare secrets.

The Worker is request-driven: Telegram sends updates to its HTTPS webhook, so no laptop or polling process must remain running. Cloudflare's documented Free plan currently includes 100,000 Worker requests per day. D1 has free-plan quotas; when a limit is reached, requests that need the exhausted database operation can fail until the quota resets. Review the current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 FAQ](https://developers.cloudflare.com/d1/reference/faq/) before launching a large public bot. Free-plan availability does not guarantee that every account or region will pass registration without additional verification.

## Deploy using a phone

You can do the setup in a mobile browser and GitHub mobile. Do not put your Telegram token in this repository.

### 1. Create the D1 database

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com/).
2. Open **Workers & Pages → D1 SQL Database** and create a database named `weirdwolf-db`.
3. Open the database's SQL console and execute the contents of [schema.sql](schema.sql).
4. Copy the database ID shown in Cloudflare.

### 2. Add the database ID to the repository

1. Open `web/wrangler.toml` on the `weirdwolf-web` branch in GitHub.
2. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with the database ID you copied.
3. Commit the change. The database ID is an identifier, not a password; **never commit secrets**.

### 3. Connect Cloudflare to GitHub

1. In Cloudflare, open **Workers & Pages → Create application → GitHub** and connect your GitHub account if prompted.
2. Choose the `mic3ul/Werewolf` repository and the `weirdwolf-web` branch.
3. Set the project root directory to `web`. The Worker name must be `weirdwolf`, matching `name` in `wrangler.toml`.
4. Use `npx wrangler deploy` as the deploy command. No build command is required.
5. Deploy and note the Worker URL, normally ending in `.workers.dev`.

See Cloudflare's [Git integration guide](https://developers.cloudflare.com/workers/ci-cd/builds/) if the dashboard labels differ.

### 4. Configure secrets

In the Worker's **Settings → Variables and Secrets** page, add these as **Secrets**, not ordinary source-code values:

| Secret name | Value |
| --- | --- |
| `BOT_TOKEN` | Token from @BotFather |
| `WEBHOOK_SECRET` | A unique random value using only letters, numbers, underscores, and hyphens |
| `SETUP_KEY` | A separate, unique random password used only to register the webhook |

Optionally add `BOT_USERNAME` as a normal variable containing the bot username **without** the `@` sign. Never put `BOT_TOKEN`, `WEBHOOK_SECRET`, or `SETUP_KEY` in GitHub commits or public messages.

After changing secrets, trigger a new deployment if Cloudflare asks you to do so.

### 5. Register the Telegram webhook

1. Open `https://YOUR-WORKER-URL/setup` in your mobile browser.
2. Enter the `SETUP_KEY` you saved in Cloudflare and press **Register webhook**.
3. Wait for the success message. This page does not ask for your bot token; the Worker registers its own HTTPS URL with Telegram using the stored secrets.
4. Open `https://YOUR-WORKER-URL/health`. The response should contain `"ok": true`.

If registration fails, confirm that all three secrets are saved, the Worker is deployed, and its public URL opens over HTTPS. Do not send your bot token to anyone helping with debugging.

## Play

1. Open the bot in Telegram and press **Start** in its private chat. Each player must do this before joining so the bot can deliver secret role cards.
2. Add the bot to a group. Group members can use:
   - `/newgame` — create a room.
   - `/join` — join the lobby.
   - `/begin` — start the game (the room creator only; at least four players).
   - `/players` — list players.
   - `/endday` — end day voting early (the room creator).
   - `/cancel` — cancel the round (the room creator).
   - `/help` — show the command list.
3. During the night, living roles with abilities receive private inline buttons. During the day, living players vote with group buttons. The game ends when the village eliminates every wolf or the wolves equal/outnumber the other living players.

## Development

This folder has no runtime npm dependencies. With Node.js 20 or newer, run:

```sh
npm run check
```

The tests cover role assignment and the game win conditions. The GitHub Actions workflow also runs these checks for changes to this web edition.

## Attribution and license

WeirdWolf is an independent fork of Werewolf for Telegram maintained by Qais (Weirdo). The original project's GPL-3.0 license and upstream attribution remain applicable. This web edition is a separate implementation and does not claim compatibility with every feature of the original Windows application. See the repository's root license for the full terms.
