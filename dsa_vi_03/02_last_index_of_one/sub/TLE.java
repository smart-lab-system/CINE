

// User function Template for Java

class Solution {
    public int lastIndex(String s) {
       int i=s.length()-1;
        while(i>=0){
            if(s.charAt(i)=='1'){
                break;
            }
        }
        return i;
    }
}