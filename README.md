# Mines & Bombs

A polished browser-based risk game inspired by classic Mines gameplay. Players choose a bet, reveal safe tiles to increase their multiplier, and decide whether to cash out or keep pushing their luck.

## Overview

This project is a single-page React and TypeScript application focused on simple game interaction, responsive UI feedback, and lightweight probability-driven gameplay. The experience is designed to feel fast and readable while still giving the player useful decision-making information during each round.

## Features

- Adjustable board sizes from `3 x 3` to `6 x 6`
- Configurable bomb count and bet amount
- Live multiplier and payout tracking
- Risk meter showing the probability of the next tile being safe
- Expected value comparison for cashing out versus continuing
- Sound effects with volume control
- End-of-round board reveal so players can review the outcome
- Reset and replay flow for quick repeated rounds

## Tech Stack

- React
- TypeScript
- Create React App
- React Testing Library

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) installed
- `npm` available in your terminal

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/mines-game.git
cd mines-game
npm install
```

### Run Locally

```bash
npm start
```

The app will open in development mode at [http://localhost:3000](http://localhost:3000).

## Available Scripts

### `npm start`

Runs the development server.

### `npm test -- --watchAll=false`

Runs the test suite once without watch mode.

### `npm run build`

Creates an optimized production build in the `build/` directory.

## How To Play

1. Choose the grid size, bomb count, and bet amount.
2. Start the round.
3. Reveal tiles one at a time.
4. Each safe tile increases the payout multiplier.
5. Cash out before hitting a bomb to secure your winnings.
6. If you hit a bomb, the round ends and the full board is revealed.

## Project Structure

```text
mines-game/
├── public/
├── src/
│   ├── App.tsx
│   ├── App.test.tsx
│   ├── index.tsx
│   └── index.css
├── package.json
└── tsconfig.json
```

## Notes

- `node_modules/` and `build/` are excluded from Git and are recreated locally with `npm install` and `npm run build`.
- No secret environment variables are required for the current version of the app.

## Future Improvements

- Persistent score or balance history
- Difficulty presets
- Animations and richer round statistics
- Mobile-specific UI refinements

## License

This project is currently unlicensed and intended for educational or portfolio use unless otherwise noted.
