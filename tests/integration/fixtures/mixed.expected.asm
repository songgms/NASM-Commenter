; @fixture: mixed
; @description: 宏定义、多 section、字符串扫描 strlen 模式等混合场景
; @abi: linux-x64
; @expected-comments: 20
%define SYS_EXIT 60             ; 定义宏常量 SYS_EXIT = 60

section .data                   ; 声明已初始化数据段 .data
    text db "nasm", 0           ; 定义字符串 text: "nasm", 0

section .text                   ; 声明代码段 .text
    global _start               ; 导出符号 _start(链接器可见)

_start:                         ; 函数入口: _start
    mov rdi, text               ; 将标签 text 的地址加载到 rdi
    xor al, al                  ; al 清零(自身异或)
    mov rcx, -1                 ; 将立即数 -1 加载到 rcx
    repne scasb                 ; 重复扫描直到 [rdi] 字节等于 al(找到结尾 0, strlen 的实现)
    mov rax, 1                  ; 系统调用号 1(write)
    mov rdi, 1                  ; 参数1: fd = 1(1 为 stdout)
    mov rsi, text               ; 参数2: 输出缓冲区地址
    mov rdx, 4                  ; 参数3: 输出字节数
    syscall                     ; 执行 write 系统调用输出字符串
    mov rax, SYS_EXIT           ; 系统调用号 60(exit)
    xor rdi, rdi                ; 参数1: 退出码 0(rdi 自异或清零)
    syscall                     ; 执行 exit 系统调用终止进程
