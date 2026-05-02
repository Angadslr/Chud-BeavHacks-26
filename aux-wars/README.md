# Aux Wars

Shared listening room: thumbs up/down on each queued YouTube track; highest **net score** plays next. Built for live demos (phones + one laptop).

## Stack

- React (Vite), Tailwind CSS v4, React Router
- Firebase **Realtime Database** (no custom backend)
- YouTube Data API v3 (search) + YouTube IFrame API (playback)
## Setup

1. **Clone env**

   ```bash
   cp .env.example .env
   ```

2. **Firebase**

   - Create a project, enable **Realtime Database** (not Firestore for this app).
   - Copy the web app config into `.env` as the `VITE_FIREBASE_*` variables.
   - Use open rules only for hackathon demos, for example:

     ```json
     {
       "rules": {
         ".read": true,
         ".write": true
       }
     }
     ```

     Tighten before any public launch.

3. **YouTube Data API v3**

   - Enable the API in Google Cloud, create an API key.
   - Set `VITE_YOUTUBE_API_KEY` in `.env`.
   - Restrict the key by **HTTP referrers** (your Vercel domain and `http://localhost:*`).

4. **Install & run**

   ```bash
   npm install
   npm run dev
   ```

## Deploy (Vercel)

- Root directory: `aux-wars` (or deploy this folder as its own repo).
- Add the same `VITE_*` environment variables in the Vercel project.
- SPA rewrites are in [`vercel.json`](vercel.json).

## Demo script

1. Open the app on a laptop, enter a display name, **Create room**.
2. Share **Copy link** or the room code; judges open on their phones and **Join**.
3. **Add song** → search → add 3–4 tracks.
4. Everyone uses **👍 / 👎** on each song in the vibe leaderboard; the queue re-ranks in real time.
5. When the current track ends, the top of the queue promotes to **Now playing** (confetti on change).

## Data shape

Under `rooms/{roomId}/`: `createdAt`, `lastActivityAt`, `nowPlaying`, `queue`, `votes`, `users`, `playHistory`, as described in the project spec. Songs include `addedByUserId` for Hall of Shame downvote tallies.

Auto-kick: tracks at **-5 net score** are removed; voters may see a short “The people have spoken” toast.

After **3 hours** without `lastActivityAt` updates, the room UI redirects home (data is not auto-deleted without a scheduled job).
