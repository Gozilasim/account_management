
## File Metadata Headers

- For every created or modified editable source, documentation, or configuration file, add a metadata header at the top of the file.
- Use this exact metadata format:

```text
Created at: YYYY-MM-DD HH:mm
Updated at: YYYY-MM-DD HH:mm
Description: short purpose of this file
```

- Use the file's valid comment syntax for the header so the file remains valid.
- For TypeScript, JavaScript, and CSS files, use `/* ... */` or `// ...`.
- For Markdown files, use normal Markdown text or a comment-style block.
- For HTML files, use `<!-- ... -->`.
- Do not add metadata headers to generated files, lockfiles, build output, binaries, media files, `node_modules`, `dist`, or similar vendor/output folders.


## Section Dividers

- Separate each major file section with a visible divider that uses the file's valid comment syntax.
- For TypeScript or JavaScript files, use this pattern:

```ts
// ###############################################
// Section Name
// ###############################################
```

- For CSS files, use this pattern:

```css
/* ###############################################
   Section Name
   ############################################### */
```

- For Markdown files, prefer headings. Hash divider lines are allowed when they make the document easier to scan.