/**
 * 类型定义统一出口。
 *
 * 约束：types/ 下禁止 import 任何运行时代码（只允许 import 其他 type 文件），
 * 可被 client 与 server 共享。
 */
export type {
  TokenType,
  Token
} from './token'

export type {
  OperandType,
  OperandSize,
  MemoryOperand,
  Operand
} from './operand'

export type {
  LineKind,
  InstructionCategory,
  ParsedLine
} from './line'

export type {
  OperandsSignature,
  InstructionEntry,
  InstructionSemantics,
  PatternOperandConstraint,
  CommentPattern,
  SyscallInfo,
  SyscallTable,
  ABI,
  CallingConvention,
  RegisterConventions,
  KnowledgeData
} from './knowledge'

export type {
  CommentSource,
  CommentStyle,
  CommentLanguage,
  CommentResult,
  TemplateVariables,
  FormatOptions,
  FormattedComment,
  AnnotatedEdit,
  CommentStats
} from './comment'

export type {
  RegisterValueKind,
  RegisterState,
  RegisterStateMap,
  StackFrameInfo,
  SyscallContext,
  FunctionInfo,
  LoopInfo,
  LineContextData
} from './context'

export type {
  LLMProvider,
  LLMConfig,
  CommentConfig
} from './config'

export type {
  NasmCommenterMethod,
  DocumentRef,
  AnnotateFileRequest,
  AnnotateFileResponse,
  AnnotateSelectionRequest,
  AnnotateFunctionRequest,
  AnnotateFunctionResponse,
  RemoveCommentsRequest,
  RemoveCommentsResponse,
  StripAllCommentsRequest,
  StripAllCommentsResponse,
  ConfigDidChangeParams,
  StatsNotificationParams
} from './lsp'
