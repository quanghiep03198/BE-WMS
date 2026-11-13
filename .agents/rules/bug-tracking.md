# Bug Tracking

Record the mistakes found in a project so they are not repeated. The knowledge is split by category, so a task reads only what relates to it.

## Layout

```text
docs/bugs/
├── README.md                 # index
├── testing/
│   └── assertion-wrong-contract.md
├── database/
│   └── read-then-write-no-lock.md
└── <category>/
    └── <mistake-name>.md
```

- **Category:** a `kebab-case` folder, created when needed. Suggestions: `testing`, `database`, `backend`, `frontend`, `infra`, `process`.
- **One file per kind of mistake**, not per occurrence. "Same bug" means the same kind of mistake anywhere, not the same line of code.
- Create `docs/bugs/` when the first mistake is recorded.
- Write the content in the language of the project's docs.

## Index: `docs/bugs/README.md`

1. **Categories:** a table with the folder, a one-line description, and the number of files.
2. **Repeated mistakes:** every mistake seen 3 or more times, each with a link, its count, and one sentence on how to avoid it.

## Mistake file

```markdown
# <Mistake name> (seen N times)

**Mistake:** <what went wrong>

**Fix:** <what to do to avoid or repair it>

| Date | PR / file | Found by | Note |
| ---- | --------- | -------- | ---- |
```

## Process

- **Before a task:** read `docs/bugs/README.md`, then open only the files in categories that relate to the task. Do not read everything. If the folder does not exist, skip this.
- **When a mistake is found** (during development, in a test run, in PR review, or reported by a person): look for a file of the same kind. If there is one, add a row and raise the count. If not, create the file and add it to the index.
- **At 3 occurrences:** add it to "Repeated mistakes" in the index. The file stays where it is.
- **When a repeated mistake happens again:** raise the count and rewrite **Fix** so it would have caught this case.
