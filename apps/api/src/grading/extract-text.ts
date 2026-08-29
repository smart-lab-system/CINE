/**
 * Getting words out of a submitted file.
 *
 * Only the two formats this slice can honestly handle: .docx through
 * mammoth (CLAUDE.md's own choice, and the submission type the MVP builds
 * first) and anything that is already text. Code projects and photographed
 * answers need a sandbox and a vision model respectively, and both are
 * their own piece of work — until then they extract to nothing, which is
 * what sends them to a human rather than to a fabricated score.
 *
 * Returning "" is a real answer here, never an error: an unreadable file is
 * a fact about the extraction, and a zero would read as a judgement about
 * the student's work.
 */

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.xml', '.yml', '.yaml', '.html', '.htm',
  '.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.c', '.h', '.cpp', '.cs',
  '.go', '.rs', '.rb', '.php', '.sql', '.sh', '.css', '.r',
]);

function extensionOf(key: string): string {
  const dot = key.lastIndexOf('.');
  return dot === -1 ? '' : key.slice(dot).toLowerCase();
}

/**
 * @param declaredFilename the name the teacher DECLARED for this
 * deliverable, not the storage key. A submission's key is built from ids so
 * that nothing user-typed can steer it, which means it carries no extension
 * and cannot say what the bytes are.
 */
export async function extractText(bytes: Buffer, declaredFilename: string): Promise<string> {
  const extension = extensionOf(declaredFilename);

  if (extension === '.docx') {
    // Imported lazily: mammoth pulls in a chunk of XML machinery, and only
    // this one path needs it.
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    return value;
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    return bytes.toString('utf8');
  }

  // .pdf, .doc, images, archives. Deliberately empty rather than a guess:
  // decoding a PDF as UTF-8 produces plausible-looking rubbish, and
  // plausible-looking rubbish is what a keyword matcher scores highest.
  return '';
}
