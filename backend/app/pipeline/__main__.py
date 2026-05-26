"""Allow ``python -m app.pipeline`` to invoke the build orchestrator."""

from .build import main

if __name__ == "__main__":
    main()
