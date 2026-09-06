; @fixture: struct
; @description: struc 结构体定义与字段偏移引用
; @abi: linux-x64
struc MyStruct
    .id:     resd 1
    .value:  resq 1
    .name:   resb 8
endstruc

section .bss
    item resb MyStruct_size

section .text
    global _start

_start:
    lea rbx, [item]
    mov dword [rbx + MyStruct.id], 7
    mov rax, [rbx + MyStruct.value]
    mov rdi, rax
    mov rax, 60
    syscall
