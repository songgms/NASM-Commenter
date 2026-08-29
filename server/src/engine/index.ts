/**
 * 注释引擎模块统一出口。
 */
export { renderTemplate, describeOperand } from './template-renderer'
export {
  formatComment,
  toEdit,
  alignColumn,
  AUTO_MARKER,
  DEFAULT_MARKER
} from './comment-formatter'
export { shouldSkip, extractAutoComments, buildRemoveEdits } from './deduplicator'
export {
  CommentEngine,
  buildEdits,
  formatOptionsOf,
  annotateSource,
  annotateSourceEnhanced,
  buildFunctionComment
} from './comment-engine'
export type { AnnotationOutput, SourceAnnotation, FunctionComment } from './comment-engine'
