; @fixture: syscall
; @description: read/write 系统调用与参数回溯
; @abi: linux-x64
; @expected-comments: 17
section .bss                    ; 声明未初始化数据段 .bss
    buf resb 64                 ; 保留 64 个字节未初始化空间

section .text                   ; 声明代码段 .text
    global _start               ; 导出符号 _start(链接器可见)

_start:                         ; 函数入口: _start
    mov rax, 0                  ; 将立即数 0 加载到 rax
    mov rdi, 0                  ; 将立即数 0 加载到 rdi
    mov rsi, buf                ; 将标签 buf 的地址加载到 rsi
    mov rdx, 64                 ; 将立即数 64 加载到 rdx
    syscall                     ; 调用 read(0, buf, 64, r10, r8, r9): 读文件
    mov rax, 1                  ; 系统调用号 1(write)
    mov rdi, 1                  ; 参数1: fd = 1(1 为 stdout)
    mov rsi, buf                ; 参数2: 输出缓冲区地址
    mov rdx, 64                 ; 参数3: 输出字节数
    syscall                     ; 执行 write 系统调用输出字符串
    mov rax, 60                 ; 系统调用号 60(exit)
    mov rdi, 0                  ; 参数1: 退出码 0
    syscall                     ; 执行 exit 系统调用终止进程
