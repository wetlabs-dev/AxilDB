# Botanical Charcoal implementation verification

These are actual rendered implementation screenshots with fictional local data, not the original audit proposals. Approved decisions are retained in approved-decisions.md. results.json contains localized computed opaque foreground/background checks; it is not an application-wide accessibility certification.

- [Dark dashboard](dashboard.dark.desktop.jpg) · [Light dashboard](dashboard.light.desktop.jpg)
- [Dark mobile Care Queue](care.dark.mobile.jpg) · [Light Care Queue](care.light.mobile.jpg)
- [Dark AI review](curator.dark.desktop.jpg) · [Light AI review](curator.light.desktop.jpg)
- [Dark shared components and deployment states](components.dark.jpg) · [Light components](components.light.jpg)
- [Dark cadence dialog](cadence-dialog.dark.mobile.jpg) · [Light dialog](cadence-dialog.light.mobile.jpg)
- [Public exhibit light boundary](public-exhibit.jpg)

Scope: nine route defaults × two themes × two viewport sizes; expanded instance and Curator details; cadence dialog opening and Escape close; production component fixtures for controls, care/tag palettes, framing, metric chart and three deployment states. Keyboard focus, primary hover and print role values checked. Public exhibit and marketing light boundaries checked; shared care sheet keeps the user's theme. Requests were isolated to localhost and browser mutations blocked.

Limitations: no production deployment actions, real uploads, native camera, live provider calls, native picker coverage, Safari/Firefox or screen-reader certification. Background calculations here require an opaque ancestor; skipped translucent pairs are not silently counted as passes. Disabled controls are excluded from normal text contrast assertions. Production build (including TypeScript) passed. Focus indicator contrast measured 6.24:1 in light and 8.91:1 in dark against the field background; primary hover measured 8.42:1 and 5.65:1 respectively. Primary enabled labels measure 6.99:1 in dark and secondary approval labels 8.30:1.

Deployment: normal Web update. No new schema migration or host configuration change.
