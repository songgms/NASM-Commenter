; @fixture: loop
; @description: 递减计数循环与循环回跳注释
; @abi: linux-x64
; @expected-comments: 14
section .text                   ; [nasm-commenter] 声明代码段 .text
    global _start               ; [nasm-commenter] 导出符号 _start（链接器可见）

_start:                         ; [nasm-commenter] 函数入口：_start
    mov rcx, 10                 ; [nasm-commenter] 将立即数 10 加载到 rcx
    xor rax, rax                ; [nasm-commenter] rax 清零（自身异或）
sum_loop:                       ; [nasm-commenter] 标签 sum_loop（跳转目标）
    add rax, rcx                ; [nasm-commenter] 将 rcx 加到 rax
    dec rcx                     ; [nasm-commenter] rcx 减 1
    jnz sum_loop                ; [nasm-commenter] 结果非零（ZF=0）时跳转到 sum_loop（回跳到 sum_loop 构成循环）
    mov rbx, rax                ; [nasm-commenter] 将 rax 的值复制到 rbx

    mov rcx, 5                  ; [nasm-commenter] 将立即数 5 加载到 rcx
wait_loop:                      ; [nasm-commenter] 标签 wait_loop（跳转目标）
    dec rcx                     ; [nasm-commenter] rcx 减 1
    jnz wait_loop               ; [nasm-commenter] 结果非零（ZF=0）时跳转到 wait_loop（回跳到 wait_loop 构成循环）

    mov rax, 60                 ; [nasm-commenter] 系统调用号 60（exit）
    mov rdi, 0                  ; [nasm-commenter] 参数1：退出码 0
    syscall                     ; [nasm-commenter] 执行 exit 系统调用终止进程
