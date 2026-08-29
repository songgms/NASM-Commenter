; factorial.asm — 递归阶乘（NASM Commenter 演示）
; 汇编: nasm -f elf64 factorial.asm && ld factorial.o -o factorial
section .text
    global _start
    global factorial

_start:
    mov rdi, 5
    call factorial
    mov rdi, rax

    mov rax, 60
    syscall

; 计算 rdi 的阶乘，结果在 rax
factorial:
    push rbp
    mov rbp, rsp
    sub rsp, 16

    cmp rdi, 1
    jg recurse
    mov rax, 1
    jmp done

recurse:
    mov [rbp-8], rdi
    dec rdi
    call factorial
    imul rax, [rbp-8]

done:
    leave
    ret
