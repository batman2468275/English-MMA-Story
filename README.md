# How I Fell in Love with MMA

A cinematic, scroll-controlled personal story. One fixed 3D canvas (three.js / React Three Fiber) sits behind the page; your
scroll position drives the camera, lighting, particles and a signature animated sequence ("The Storm"), while the text
animates in over the top. Built with **React + Vite + TypeScript**, **GSAP ScrollTrigger**, **Lenis** smooth scrolling.

---

## 1. Run it on your computer

You need **Node.js 20 or newer** (the free "LTS" download from <https://nodejs.org>). Then, in a terminal inside this folder:

```bash
npm install
npm run dev
```

Open the address it prints (usually <http://localhost:5173>). That's it â€” edit a file and the page updates live.

## 2. Build it

```bash
npm run build      # type-checks, then writes the finished site into the dist/ folder
npm run preview    # optional: serve dist/ locally to check the production build
```

`dist/` is a plain static website (HTML + JS + CSS). It uses relative paths, so it works from any URL or sub-folder.

## 3. Get a live, shareable link

### Option A â€” Vercel (easiest, ~3 minutes, free)

1. Put this folder on GitHub (create a free account at <https://github.com>, click **New repository**, then
   **uploading an existing file** and drag the whole folder in â€” *don't* upload `node_modules`).
2. Go to <https://vercel.com>, sign up with GitHub, click **Add Newâ€¦ â†’ Project**, pick your repository and press **Deploy**.
   Vercel detects Vite automatically (settings are already in `vercel.json`).
3. In about a minute you get a link like `https://your-project.vercel.app`. Every time you update the GitHub repo, the site redeploys.

*No GitHub? From this folder run `npx vercel` and follow the prompts â€” it uploads straight from your computer.*

### Option B â€” Netlify Drop (no account setup, drag & drop)

Run `npm run build`, then drag the **`dist`** folder onto <https://app.netlify.com/drop>. You get a link immediately.

### Option C â€” GitHub Pages

A workflow is already included (`.github/workflows/deploy.yml`). Push the project to a GitHub repo, then
**Settings â†’ Pages â†’ Source: GitHub Actions**. Every push to `main` publishes the site to
`https://<your-username>.github.io/<repo-name>/`.

---

## 4. Make it yours

| What | Where |
| --- | --- |
| All the story text, timeline milestones, storm fragments, closing line | [`src/content/story.ts`](src/content/story.ts) |
| **Colours / retheme** (red â†’ black-and-gold) | [`src/theme.css`](src/theme.css). Add `data-theme="gold"` to `<html>` in `index.html` for the ready-made gold palette, or edit `--accent`, `--accent-glow`, `--accent-2`. The 3D scenes read these same variables. |
| Lighting & colour grade of each chapter (fog, key light, bloom, saturationâ€¦) | [`src/core/grade.ts`](src/core/grade.ts) |
| How long each chapter lasts in scroll | `height` (in screen-heights) per chapter in `story.ts` |

### Project map

```
src/
  content/       story.ts (all words)
  core/          scroll.ts (Lenis + ScrollTrigger â†’ per-section progress), fx.ts (flash/shake/flare), grade.ts, store.ts
  scene/
    Experience.tsx   the one fixed <Canvas>, shader warm-up, adaptive resolution
    Rig.tsx          shared lights + fog that ease between chapters
    Post.tsx         bloom + custom grade/shockwave/time-dilation pass
    scenes/          ONE FILE PER CHAPTER  (Hero, Driveway, Basement, Van, Storm, Quiet, Sunset, Cloud, Gym, Partners, Foot, Flow, Timeline, Now)
    figure.ts        the stylised low-poly humanoid + two-bone IK used by every fighter silhouette
  sections/      the DOM layer for each chapter (text, cards)
  ui/            loader, cursor, cage-fence progress bar, audio toggle, magnetic button, scrubbed text
  audio/         procedural ambient audio (rain, crowd, drone, heartbeat) â€” no audio files needed
```

Each chapter's 3D lives in its own file in `src/scene/scenes/`, and its text layout in `src/sections/` (most chapters share
`Chapter.tsx`), so you can rework one chapter without touching the others.

### How the Storm works (the centerpiece)

[`src/scene/scenes/Storm.tsx`](src/scene/scenes/Storm.tsx) â€” real 3D: a displaced-geometry ocean (shader), particle rain, a
dome sky with lightning-lit clouds, bolts, and a low-poly swimmer whose arm is driven by IK so the hand really grabs the
debris and the glowing octagon ring. **Every beat is a pure function of scroll progress**, so scrolling back up visibly
reverses it (the swimmer is pulled away from the ring, the storm returns). Beats: 1 wide shot â†’ 2 close-up, three failed
grabs â†’ 3 the key line + last attempt â†’ 4 grab + light flare + sound â†’ 5 the sea calms, stars and dawn appear.

## 5. Features checklist

* Scroll-scrubbed + reversible animation (GSAP ScrollTrigger), Lenis smooth scrolling
* Different text reveal per chapter (character, mask-wipe, blur-fade, slide, scale, 3D flipâ€¦)
* Multi-layer parallax (`data-speed` on any element), cage-fence scroll indicator, glowing cursor, magnetic button
* Loading screen with progress while shaders warm up
* Optional ambient audio â€” **muted by default**, toggle bottom-left (rain, crowd, heartbeat, drone, plus impact/payoff sounds)
* Mobile: fewer particles/figures, no bloom/MSAA, lower pixel ratio, portrait-aware camera & layout
* Adaptive resolution (drops pixel ratio automatically if the frame rate dips)
* `prefers-reduced-motion` (and no-WebGL): the full story as a calm static page â€” no 3D, no scroll animation

## 6. Handy developer URLs (only for testing)

* `?reduced` â€” force the reduced-motion version
* `?mobile` / `?desktop` â€” force the mobile / desktop 3D profile
* `?skipcompile` â€” skip the shader warm-up (useful on slow machines while developing)
* `?lite` â€” no bloom / low resolution

## Credits / notes

Facts used (UFC 317, June 28, 2025: Joshua Van def. Brandon Royval by unanimous decision; Alexandre Pantoja submitted Kai
Kara-France with a rear-naked choke in round 3) come from your brief; everything else is your own story. Fonts (Bebas Neue,
Inter) are bundled via `@fontsource`, so the site has no external requests.

