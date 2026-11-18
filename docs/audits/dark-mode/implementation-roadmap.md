# Proposed implementation roadmap

No phase below is authorized by completion of this audit; review decisions first.

1. **Accessibility foundation:** DM-003, DM-004, DM-008. Define distinct accent foreground, action background, focus, status foreground/background, surface, elevated and inset roles. Measure pairs in both themes and keyboard interaction. Keep disabled states separate from actionable controls.
2. **Visible failures:** DM-001, DM-002, DM-005, DM-006. Replace literals at their owning components. Confirm actual painted backgrounds for translucent candidates; test loading/error/unavailable and empty states.
3. **Semantic review and consolidation:** DM-007, DM-009. Migrate AI comparison/status and neutral forms to roles, reduce compatibility selectors only after regression evidence. Preserve chart/tag/care identity and intentional print/light exceptions.
4. **Visual direction:** DM-010. Apply the selected A/B/C direction after separate approval. Recheck mobile overflow, nested panels, dialogs, tooltip/menu layers, focus/hover/pressed, contrast, forced colors and reduced motion.
5. **Release verification:** repeat the route gallery and conditional states; close sitter and live-agent gaps in an isolated environment. Compare light and dark desktop/mobile, perform keyboard and screen-reader passes, then document deploy scope. No schema or host configuration is proposed by this audit.
