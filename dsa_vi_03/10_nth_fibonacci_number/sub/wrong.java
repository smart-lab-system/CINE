// User function Template for Java

class Solution {
    public int nthFibonacci(int n) {
     
     if(n == 0 || n == 1 ) return 1;
     if(n <= 1 )
     {
         return n;
     }
     
     return nthFibonacci(n-1) + nthFibonacci(n-2);
    }
}