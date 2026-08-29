; @fixture: loop
; @description: 递减计数循环与循环回跳注释
; @abi: linux-x64
; @expected-comments: 14
section .text
    global _start

_start:
    mov rcx, 10
    xor rax, rax
sum_loop:
    add rax, rcx
    dec rcx
    jnz sum_loop
    mov rbx, rax

    mov rcx, 5
wait_loop:
    dec rcx
    jnz wait_loop

    mov rax, 60
    mov rdi, 0
    syscall
