; @fixture: complex-macro
; @description: 简单宏定义/展开、条件汇编块与不平衡诊断场景
; @abi: linux-x64
%macro PRINT_STR 3              ; 定义多行宏 PRINT_STR 3
    mov rax, 1                  ; 将立即数 1 加载到 rax
    mov rdi, %1                 ; 将源操作数的值复制到目标操作数(rdi, %1)
    mov rsi, %2                 ; 将源操作数的值复制到目标操作数(rsi, %2)
    mov rdx, %3                 ; 将源操作数的值复制到目标操作数(rdx, %3)
    syscall                     ; 调用 write(rdi, rsi, rdx, r10, r8, r9): 写文件
%endmacro

section .text                   ; 声明代码段 .text
    global _start               ; 导出符号 _start(链接器可见)

_start:                         ; 函数入口: _start
    PRINT_STR 1, msg, 13        ; 调用宏 PRINT_STR(1, msg, 13)
    mov rax, 60                 ; 系统调用号 60(exit)
    xor rdi, rdi                ; 参数1: 退出码 0(rdi 自异或清零)
    syscall                     ; 执行 exit 系统调用终止进程
