

// User function Template for Java

class Solution {
    public int lastIndex(String s) {
        for(int i=s.length();i>=0;i--){
            if(s.charAt(i)=='1'){
                return i;
            }
        }
        else{
            return -1;
        }
    }
}