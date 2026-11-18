

//User function Template for Java

class Solution
{
    public String removeConsonants(String s)
    {
        //code here.
    
        StringBuilder sb = new StringBuilder();
        
        String s1 = "No Vowel";
        
        int count =0;
        
        for (int i=0; i<s.length() ; i++){
            
         char ch = s.charAt(i);
            
            
            if (ch == 'a' || ch == 'e' || ch == 'i' || ch == 'o' || ch == 'u' ||
                ch == 'A' || ch == 'E' || ch == 'I' || ch == 'O' || ch == 'U'){
                
                
                   sb.append(s.charAt(i));
                   count++;
            }
            
            
        }
        
        if(count==0){
            
            return s1;
            
        }
        
        else {
        
        
        return sb.toString();
        
    }
}



}