; hello.asm — Linux x64 Hello World（NASM Commenter 演示）
; 汇编: nasm -f elf64 hello.asm && ld hello.o -o hello
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
