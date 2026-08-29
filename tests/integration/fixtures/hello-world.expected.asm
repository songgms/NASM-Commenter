; @fixture: hello-world
; @description: 基本的 Linux x64 hello world 程序
; @abi: linux-x64
; @expected-comments: 12
section .data                   ; [nasm-commenter] 声明已初始化数据段 .data
    msg db "hello world", 10    ; [nasm-commenter] 定义字符串 msg："hello world", 10
    len equ $ - msg             ; [nasm-commenter] 定义常量 len = $ - msg

section .text                   ; [nasm-commenter] 声明代码段 .text
    global _start               ; [nasm-commenter] 导出符号 _start（链接器可见）
_start:                         ; [nasm-commenter] 函数入口：_start
    mov rax, 1                  ; [nasm-commenter] 系统调用号 1（write）
    mov rdi, 1                  ; [nasm-commenter] 参数1：fd = 1（1 为 stdout）
    mov rsi, msg                ; [nasm-commenter] 参数2：输出缓冲区地址
    mov rdx, len                ; [nasm-commenter] 参数3：输出字节数
    syscall                     ; [nasm-commenter] 执行 write 系统调用输出字符串
    mov rax, 60                 ; [nasm-commenter] 系统调用号 60（exit）
    xor rdi, rdi                ; [nasm-commenter] 参数1：退出码 0（rdi 自异或清零）
    syscall                     ; [nasm-commenter] 执行 exit 系统调用终止进程
