# Tasks

- [x] Create a Zustand store in `frontend/store/useTerminalStore.ts`
- [x] Refactor `frontend/app/page.tsx` to use the Zustand store
- [x] Set up Wagmi + RainbowKit in `frontend/components/Web3Provider.tsx` and `layout.tsx`
- [x] Add an `ErrorBoundary` and react-hot-toast `Toaster`
- [x] Setup offline PWA with `next-pwa`
- [x] Add `vitest` config and test setup
- [x] Implement basic routes for `/settings` and `/about`
- [x] Add skeleton loading to `Sidebar.tsx`
- [x] Install `recharts`, create `frontend/components/charts/PriceChart.tsx`, update `frontend/components/MessageBubble.tsx` to render this chart
- [x] Install `framer-motion`. Update `MessageBubble.tsx` to wrap the bubble in `<motion.div>`. Update `Sidebar.tsx` to stagger animate chat items.
- [x] Install `cmdk`. Create `frontend/components/CommandPalette.tsx` that triggers on Cmd+K/Ctrl+K. Mount it in `layout.tsx`.
- [x] Install `@playwright/test` as a dev dependency, add `playwright.config.ts`, and create `e2e/chat.spec.ts` with a basic test.
- [x] Update `frontend/package.json` with the new dependencies: `recharts`, `framer-motion`, `cmdk`, and `@playwright/test`.
- [x] Update `TerminalBoot.tsx` to add `sessionStorage` check and framer-motion glowing orb in the background.
- [x] Add `.glass-panel` to `globals.css` and apply to `Sidebar` and `Header`.
- [x] Create `HeroState.tsx` with animated typing and refactored empty state UI.
- [x] Create `PremiumButton.tsx` and integrate it for the Connect Wallet CTA on `HeroState.tsx`.
