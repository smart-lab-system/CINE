// Kept in its own file, with no other imports, so the controller and
// processor can both depend on this constant without either of them
// creating a circular import with students-import.module.ts (which
// imports both of them). A cycle here previously left this constant
// `undefined` at the point @InjectQueue(...) evaluated it, silently
// resolving to Nest's 'default' queue instead of this one.
export const STUDENTS_IMPORT_QUEUE = 'students-import';
