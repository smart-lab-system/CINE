

// User function Template for Java

class Solution {
    public int lastIndex(String s) {
        char c[]= s.toCharArray();
        int idx = 0;
        for(int i=0 ;i<c.length;i++) {
            if(c[i]=='1'){
                idx = i;
                return idx;
            }
            
        }   
        return -1;
    }
}