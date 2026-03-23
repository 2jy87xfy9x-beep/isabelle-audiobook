# Isabelle — Smart Audiobook

A browser-based audiobook with text-to-speech, inline editing, focus modes, and cross-device sync via GitHub.

## Setup

### 1. Prerequisites
- [Node.js 18+](https://nodejs.org) installed on your PC (only needed for the one-time extraction)
- A free [GitHub account](https://github.com)

### 2. Extract the book content
From this folder, run:
```
node extract.js
```
You should see: `✓ Extracted N paragraphs to book.json`
If N is less than 100, something went wrong — check that `Isabelle.html` is in the same folder.

### 3. Create a GitHub repository
1. Go to github.com and create a new **public** repository named `isabelle-audiobook`
2. Upload `index.html`, `book.json`, and `extract.js` to the repository

### 4. Enable GitHub Pages
1. In your repo, go to **Settings → Pages**
2. Set Source to **Deploy from a branch**
3. Set branch to `main`, folder to `/ (root)`
4. Click Save
5. Wait a few minutes, then open the URL shown (e.g. `https://yourusername.github.io/isabelle-audiobook`)

### 5. Add your GitHub token
1. Go to: github.com → Settings → Developer settings → Personal access tokens → Tokens (classic) → **New token**
2. Select scope: **`public_repo`** only
3. Copy the token
4. Open your app URL, click **⚙ Settings**, paste the token, and click Save Settings
5. Repeat on each device you use — the token stays in that browser only

## Using the app

| Action | How |
|--------|-----|
| Play / pause | ▶ and ⏸ buttons |
| Jump to paragraph | Single click |
| Edit a paragraph | Double click |
| Save changes to GitHub | 💾 Save button |
| Change focus mode | Focus dropdown |
| Change font size | A+ / A− buttons |
| Toggle dark/light | ◐ Theme button |

## After editing
Changes saved with 💾 will appear on all your devices within a few minutes. Hard-refresh (Ctrl+Shift+R) if they don't appear.
