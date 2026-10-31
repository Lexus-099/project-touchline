# PROJECT TOUCHLINE

**A Turkish-focused football management game built on the Openfoot Manager open-source project.**

PROJECT TOUCHLINE is a community fork with its own visual identity, Turkish presentation and future data/content packs. The upstream simulation and management systems are retained and credited.

## Project identity

- **Game title:** PROJECT TOUCHLINE
- **Repository:** https://github.com/Lexus-099/project-touchline
- **Upstream project:** https://github.com/openfootmanager/openfootmanager
- **Technology:** Rust, Tauri, React, TypeScript and SQLite
- **License:** GNU General Public License v3.0 (GPL-3.0)

## Current branding changes

- Project Touchline main-menu wordmark and icon
- Project Touchline desktop/window title and application package identity
- Project Touchline dashboard sidebar mark
- GitHub link points to this fork
- Localized application name and publisher label

## Build and development

The upstream build and contribution instructions remain applicable. Install the prerequisites described in the upstream README, then run:

```bash
npm install
npm run tauri dev
```

Build and test commands:

```bash
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml --workspace
```

## Attribution and licence

PROJECT TOUCHLINE is a modified fork of **Openfoot Manager**. The upstream project and its contributors retain their original copyright. The upstream GPL-3.0 licence is preserved in [LICENSE.md](LICENSE.md). Changes in this fork are made available under the same licence.

Upstream author and project information:
- Openfoot Manager: https://github.com/openfootmanager/openfootmanager
- Upstream README and contribution guidance: https://github.com/openfootmanager/openfootmanager/blob/develop/README.md

This fork does not claim ownership of the upstream engine or third-party player data, club crests, photographs, trademarks or other licensed assets. Such assets must be sourced and redistributed only with appropriate rights.
