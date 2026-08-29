; @fixture: function-call
; @description: 函数调用与标准栈帧序言/结尾
; @abi: linux-x64
; @expected-comments: 18
section .text                   ; 声明代码段 .text
    global _start               ; 导出符号 _start(链接器可见)
    global add_numbers          ; 导出符号 add_numbers(链接器可见)

_start:                         ; 函数入口: _start
    mov rdi, 3                  ; 将立即数 3 加载到 rdi
    mov rsi, 4                  ; 将立即数 4 加载到 rsi
    call add_numbers            ; 调用函数 add_numbers(返回地址压栈)
    mov rdi, rax                ; 将 rax 的值复制到 rdi
    mov rax, 60                 ; 系统调用号 60(exit)
    xor rdi, rdi                ; 参数1: 退出码 0(rdi 自异或清零)
    syscall                     ; 执行 exit 系统调用终止进程

add_numbers:                    ; 函数入口: add_numbers
    push rbp                    ; 保存旧栈帧指针 rbp
    mov rbp, rsp                ; 设置新栈帧指针: rbp = rsp
    sub rsp, 8                  ; 分配 8 字节局部变量空间
    mov dword [rbp-4], edi      ; 将 edi 的值存储到内存 dword [rbp-4](局部变量 4)
    mov eax, [rbp-4]            ; 从内存 [rbp-4] 加载值到 eax(局部变量 4)
    add eax, esi                ; 将 esi 加到 eax
    leave                       ; 恢复栈帧(rsp = rbp, 弹出 rbp)
    ret                         ; 返回调用者
