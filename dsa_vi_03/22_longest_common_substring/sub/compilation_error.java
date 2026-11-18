// User function Template for Java

class Solution {
    public int longestCommonSubstr(String s1, String s2) {
        int maxlength=0;
        int endindex=0;
       int[][] dp= new int [s1.length()+1][s2.length()+1];
       for(int i=1;i<=s1.length();i++)
       {
           for(int j=1;j<=s2.length();j++)
           {
               if(s1.charAt(i-1)==s2.charAt(j-1))
               {
                  d[i][j]= dp[i-1][j-1]+1;
                  if(d[i][j]>maxlength)
                  {
                      maxlength=d[i][j];
                  }
                   endindex=i;
               }
                   
               
               else
               {
                   dp[i][j]=0;
               }
           }
           }
       }
       return s1.substring(endindex-maxlength,endindex);
    }
}