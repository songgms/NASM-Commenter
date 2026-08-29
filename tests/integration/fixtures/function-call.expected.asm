; @fixture: function-call
; @description: 函数调用与标准栈帧序言/结尾
; @abi: linux-x64
; @expected-comments: 18
section .text                   ; [nasm-commenter] 声明代码段 .text
    global _start               ; [nasm-commenter] 导出符号 _start（链接器可见）
    global add_numbers          ; [nasm-commenter] 导出符号 add_numbers（链接器可见）

_start:                         ; [nasm-commenter] 函数入口：_start
    mov rdi, 3                  ; [nasm-commenter] 将立即数 3 加载到 rdi
    mov rsi, 4                  ; [nasm-commenter] 将立即数 4 加载到 rsi
    call add_numbers            ; [nasm-commenter] 调用函数 add_numbers（返回地址压栈）
    mov rdi, rax                ; [nasm-commenter] 将 rax 的值复制到 rdi
    mov rax, 60                 ; [nasm-commenter] 系统调用号 60（exit）
    xor rdi, rdi                ; [nasm-commenter] 参数1：退出码 0（rdi 自异或清零）
    syscall                     ; [nasm-commenter] 执行 exit 系统调用终止进程

add_numbers:                    ; [nasm-commenter] 函数入口：add_numbers
    push rbp                    ; [nasm-commenter] 保存旧栈帧指针 rbp
    mov rbp, rsp                ; [nasm-commenter] 设置新栈帧指针：rbp = rsp
    sub rsp, 8                  ; [nasm-commenter] 分配 8 字节局部变量空间
    mov dword [rbp-4], edi      ; [nasm-commenter] 将 edi 的值存储到内存 dword [rbp-4]
    mov eax, [rbp-4]            ; [nasm-commenter] 从内存 [rbp-4] 加载值到 eax
    add eax, esi                ; [nasm-commenter] 将 esi 加到 eax
    leave                       ; [nasm-commenter] 恢复栈帧（rsp = rbp，弹出 rbp）
    ret                         ; [nasm-commenter] 返回调用者
