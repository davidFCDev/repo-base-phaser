# remix-repo-base

A Phaser game built with the Remix framework.

## 🎮 Development

```bash
npm dev
```

Opens the development server with:
- Live reload
- Development dashboard
- Mobile testing via QR code
- Performance monitoring

## 🏗️ Building

```bash
npm build
```

Creates a production-ready single HTML file in the `dist` directory.

## 👁️ Preview

```bash
npm preview
```

Preview the production build locally before deploying.

## 📁 Project Structure

```
├── src/
│   ├── main.ts          # Game entry point
│   ├── scenes/          # Your game scenes
│   ├── config/          # Game settings
│   └── utils/           # Helper functions
├── index.html           # Entry point
└── package.json         # Dependencies
```

**That's it!** All build tools, dev server, and configs are managed by `@insidethesim/remix-dev`.
Just focus on building your game in the `src/` directory.

## 🎓 Learn More

- [Phaser Documentation](https://photonstorm.github.io/phaser3-docs/)
- [Remix Dev Framework](https://github.com/insidethesim/remix-dev)

## 🔄 Updating

Get the latest features and fixes:

```bash
npm update @insidethesim/remix-dev
```
