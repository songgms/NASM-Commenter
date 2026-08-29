; memcpy.asm — 内存拷贝（NASM Commenter 演示）
; 汇编: nasm -f elf64 memcpy.asm && ld memcpy.o -o memcpy
section .data
    src db "copy me!", 0
    len equ $ - src

section .bss
    dst resb 32

section .text
    global _start

_start:
    mov rsi, src
    mov rdi, dst
    mov rcx, len
    cld
    rep movsb

    mov rax, 60
    xor rdi, rdi
    syscall
