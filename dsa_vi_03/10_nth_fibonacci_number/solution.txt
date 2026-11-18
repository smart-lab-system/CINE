class Solution {
    public int nthFibonacci(int n) {
        // code here
        return fib(n);
    }
        
    public static int fib(int n){
        if(n<=1){
            return n;
        }
        return fib(n-1)+fib(n-2);
    }
}