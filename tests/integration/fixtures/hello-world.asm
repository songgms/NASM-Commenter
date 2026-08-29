; @fixture: hello-world
; @description: 基本的 Linux x64 hello world 程序
; @abi: linux-x64
; @expected-comments: 12
section .data
    msg db "hello world", 10
    len equ $ - msg

section .text
    global _start
_start:
    mov rax, 1
    mov rdi, 1
    mov rsi, msg
    mov rdx, len
    syscall
    mov rax, 60
    xor rdi, rdi
    syscall
