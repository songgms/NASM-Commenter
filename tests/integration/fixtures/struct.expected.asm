; @fixture: struct
; @description: struc 结构体定义与字段偏移引用
; @abi: linux-x64
struc MyStruct
    .id:     resd 1                   ; 保留 1 个双字 (32 位)未初始化空间
    .value:  resq 1                   ; 保留 1 个四字 (64 位)未初始化空间
    .name:   resb 8                   ; 保留 8 个字节未初始化空间
endstruc

section .bss                          ; 声明未初始化数据段 .bss
    item resb MyStruct_size           ; 保留 MyStruct_size 个字节未初始化空间

section .text                         ; 声明代码段 .text
    global _start                     ; 导出符号 _start(链接器可见)

_start:                               ; 函数入口: _start
    lea rbx, [item]                   ; 计算地址 [item] 并加载到 rbx(不访问内存内容)
    mov dword [rbx + MyStruct.id], 7  ; 将立即数 7 存储到内存 dword [rbx + MyStruct.id]
    mov rax, [rbx + MyStruct.value]   ; 从内存 [rbx + MyStruct.value] 加载值到 rax
    mov rdi, rax                      ; 将 rax 的值复制到 rdi
    mov rax, 60                       ; 将立即数 60 加载到 rax
    syscall                           ; 调用 exit([rbx + MyStruct.value], rsi, rdx, r10, r8, r9): 终止进程
