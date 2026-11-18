

// User function Template for Java

class Solution {
    public int lastIndex(String s) {
        int i=-1;
        char[] ch=s.toCharArray();
        for(int j=ch.length-1;j>=0;j--){
            if(ch[j]=='1'){
                i=j;
               break;
            }
        }return i;
    }
}