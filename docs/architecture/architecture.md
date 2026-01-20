# Nibbler Architecture

C4 model diagrams for the Nibbler RSS/Atom feed reader.

## Level 1: System Context

Shows Nibbler in context with its users and external systems.

![System Context Diagram](c4-1-context.svg)

## Level 2: Container

Shows the major containers (applications, databases) within Nibbler.

![Container Diagram](c4-2-container.svg)

## Level 3: Component (Fetch Infrastructure)

Zooms into the Background Workers container, showing the feed fetch infrastructure.

![Component Diagram](c4-3-component-fetch.svg)

## Level 4: Code (Fetch Services)

Shows the class structure of the fetch-related services.

![Code Diagram](c4-4-code-fetch.svg)

---

## Diagram Sources

All diagrams are authored in [D2](https://d2lang.com/) and can be regenerated with:

```bash
cd docs/architecture
d2 c4-1-context.d2 c4-1-context.svg
d2 c4-2-container.d2 c4-2-container.svg
d2 c4-3-component-fetch.d2 c4-3-component-fetch.svg
d2 c4-4-code-fetch.d2 c4-4-code-fetch.svg
```
