; @fixture: mixed
; @description: 宏定义、多 section、字符串扫描 strlen 模式等混合场景
; @abi: linux-x64
; @expected-comments: 20
%define SYS_EXIT 60

section .data
    text db "nasm", 0

section .text
    global _start

_start:
    mov rdi, text
    xor al, al
    mov rcx, -1
    repne scasb
    mov rax, 1
    mov rdi, 1
    mov rsi, text
    mov rdx, 4
    syscall
    mov rax, SYS_EXIT
    xor rdi, rdi
    syscall
