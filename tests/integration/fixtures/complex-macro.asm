; @fixture: complex-macro
; @description: 简单宏定义/展开、条件汇编块与不平衡诊断场景
; @abi: linux-x64
%macro PRINT_STR 3
    mov rax, 1
    mov rdi, %1
    mov rsi, %2
    mov rdx, %3
    syscall
%endmacro

section .text
    global _start

_start:
    PRINT_STR 1, msg, 13
    mov rax, 60
    xor rdi, rdi
    syscall
