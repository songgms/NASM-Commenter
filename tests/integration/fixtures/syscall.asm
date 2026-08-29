; @fixture: syscall
; @description: read/write 系统调用与参数回溯
; @abi: linux-x64
; @expected-comments: 17
section .bss
    buf resb 64

section .text
    global _start

_start:
    mov rax, 0
    mov rdi, 0
    mov rsi, buf
    mov rdx, 64
    syscall
    mov rax, 1
    mov rdi, 1
    mov rsi, buf
    mov rdx, 64
    syscall
    mov rax, 60
    mov rdi, 0
    syscall
