; @fixture: loop
; @description: 递减计数循环与循环回跳注释
; @abi: linux-x64
; @expected-comments: 14
section .text                   ; 声明代码段 .text
    global _start               ; 导出符号 _start(链接器可见)

_start:                         ; 函数入口: _start
    mov rcx, 10                 ; 将立即数 10 加载到 rcx
    xor rax, rax                ; rax 清零(自身异或)
sum_loop:                       ; 标签 sum_loop(跳转目标)
    add rax, rcx                ; 将 rcx 加到 rax
    dec rcx                     ; rcx 减 1
    jnz sum_loop                ; 结果非零(ZF=0)时跳转到 sum_loop(回跳到 sum_loop 构成循环)
    mov rbx, rax                ; 将 rax 的值复制到 rbx

    mov rcx, 5                  ; 将立即数 5 加载到 rcx
wait_loop:                      ; 标签 wait_loop(跳转目标)
    dec rcx                     ; rcx 减 1
    jnz wait_loop               ; 结果非零(ZF=0)时跳转到 wait_loop(回跳到 wait_loop 构成循环)

    mov rax, 60                 ; 系统调用号 60(exit)
    mov rdi, 0                  ; 参数1: 退出码 0
    syscall                     ; 执行 exit 系统调用终止进程
