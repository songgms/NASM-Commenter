; @fixture: function-call
; @description: 函数调用与标准栈帧序言/结尾
; @abi: linux-x64
; @expected-comments: 18
section .text
    global _start
    global add_numbers

_start:
    mov rdi, 3
    mov rsi, 4
    call add_numbers
    mov rdi, rax
    mov rax, 60
    xor rdi, rdi
    syscall

add_numbers:
    push rbp
    mov rbp, rsp
    sub rsp, 8
    mov dword [rbp-4], edi
    mov eax, [rbp-4]
    add eax, esi
    leave
    ret
